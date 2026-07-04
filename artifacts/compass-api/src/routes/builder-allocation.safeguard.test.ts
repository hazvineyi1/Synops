import { describe, it, expect } from "vitest";
import {
  builderAccessDecision,
  scopeCovered,
  type BuilderScope,
  type ScopeRef,
  type ScopeLevel,
} from "../lib/tenancy";

/**
 * Safeguard: the builder allocation coverage rule is DOWNWARD-ONLY. An active
 * allocation grants read+write to its target scope and everything beneath it,
 * never anything above it:
 *
 *   - project allocation -> read+write the whole project subtree.
 *   - course  allocation -> read+write that course + its modules/assessments/
 *     activities/classes; READ-ONLY the parent project's project-level entities
 *     (objectives/standards) for alignment; NO project-level writes.
 *   - class   allocation -> read+write that class only; READ-ONLY parent course
 *     and project context.
 *
 * Anything not even readable must be reported as not-found (404) so an
 * unallocated builder cannot probe for the existence of other curriculum data;
 * something readable-but-not-writable is a 403 ("deny_write").
 *
 * These assertions are intentionally DB-independent: they exercise the pure
 * decision functions over hand-built scope/allocation fixtures. The live
 * end-to-end auth/allocation matrix is verified separately via curl.
 */

// ── Fixture tree (all in org 1) ─────────────────────────────────────────────
//   project P1 (100)
//     course C1 (200)        class K1 (300), class K2 (301)
//     course C2 (201)        (sibling course, never allocated here)
//   project P2 (101)         (sibling project, never allocated here)
//     course C3 (202)

const ORG = 1;

function makeScope(
  level: ScopeLevel,
  projectId: number,
  courseId: number | null = null,
  classId: number | null = null,
): ScopeRef {
  return { orgId: ORG, level, projectId, courseId, classId };
}

// Representative entity scopes.
const projectP1 = makeScope("project", 100); // project-level entity (objective/qa/crosswalk)
const projectP2 = makeScope("project", 101);
const courseC1 = makeScope("course", 100, 200); // course-level entity (module/assessment/activity)
const courseC2 = makeScope("course", 100, 201);
const courseC3 = makeScope("course", 101, 202);
const classK1 = makeScope("class", 100, 200, 300);
const classK2 = makeScope("class", 100, 200, 301);

function emptyScope(): BuilderScope {
  return {
    writableProjects: new Set<number>(),
    writableCourses: new Set<number>(),
    writableClasses: new Set<number>(),
    accessibleProjects: new Set<number>(),
    accessibleCourses: new Set<number>(),
  };
}

// Builds the BuilderScope a project allocation on P1 would produce.
function projectAllocation(): BuilderScope {
  const bs = emptyScope();
  bs.writableProjects.add(100);
  bs.accessibleProjects.add(100);
  return bs;
}

// Builds the BuilderScope a course allocation on C1 would produce (parent
// project becomes read-only accessible context).
function courseAllocation(): BuilderScope {
  const bs = emptyScope();
  bs.writableCourses.add(200);
  bs.accessibleCourses.add(200);
  bs.accessibleProjects.add(100);
  return bs;
}

// Builds the BuilderScope a class allocation on K1 would produce (parent course
// and project become read-only accessible context).
function classAllocation(): BuilderScope {
  const bs = emptyScope();
  bs.writableClasses.add(300);
  bs.accessibleCourses.add(200);
  bs.accessibleProjects.add(100);
  return bs;
}

describe("builder allocation coverage is downward-only", () => {
  it("project allocation grants read+write to the entire subtree", () => {
    const bs = projectAllocation();
    for (const scope of [projectP1, courseC1, courseC2, classK1, classK2]) {
      expect(builderAccessDecision(scope, "read", bs)).toBe("allow");
      expect(builderAccessDecision(scope, "write", bs)).toBe("allow");
    }
  });

  it("project allocation does NOT reach a sibling project or its descendants", () => {
    const bs = projectAllocation();
    for (const scope of [projectP2, courseC3]) {
      expect(builderAccessDecision(scope, "read", bs)).toBe("deny_not_found");
      expect(builderAccessDecision(scope, "write", bs)).toBe("deny_not_found");
    }
  });

  it("course allocation grants read+write to the course and its descendants", () => {
    const bs = courseAllocation();
    for (const scope of [courseC1, classK1, classK2]) {
      expect(builderAccessDecision(scope, "read", bs)).toBe("allow");
      expect(builderAccessDecision(scope, "write", bs)).toBe("allow");
    }
  });

  it("course allocation gives READ-ONLY parent project context, never write", () => {
    const bs = courseAllocation();
    // A course-allocated builder may read the parent project's project-level
    // entities (for alignment) but must not write them.
    expect(builderAccessDecision(projectP1, "read", bs)).toBe("allow");
    expect(builderAccessDecision(projectP1, "write", bs)).toBe("deny_write");
  });

  it("course allocation does NOT reach a sibling course or another project", () => {
    const bs = courseAllocation();
    for (const scope of [courseC2, courseC3, projectP2]) {
      expect(builderAccessDecision(scope, "read", bs)).toBe("deny_not_found");
      expect(builderAccessDecision(scope, "write", bs)).toBe("deny_not_found");
    }
  });

  it("class allocation grants read+write to that class only", () => {
    const bs = classAllocation();
    expect(builderAccessDecision(classK1, "read", bs)).toBe("allow");
    expect(builderAccessDecision(classK1, "write", bs)).toBe("allow");
  });

  it("class allocation gives READ-ONLY parent course/project, never write", () => {
    const bs = classAllocation();
    for (const scope of [courseC1, projectP1]) {
      expect(builderAccessDecision(scope, "read", bs)).toBe("allow");
      expect(builderAccessDecision(scope, "write", bs)).toBe("deny_write");
    }
  });

  it("class allocation does NOT reach a sibling class", () => {
    const bs = classAllocation();
    expect(builderAccessDecision(classK2, "read", bs)).toBe("deny_not_found");
    expect(builderAccessDecision(classK2, "write", bs)).toBe("deny_not_found");
  });

  it("an unallocated builder can reach nothing", () => {
    const bs = emptyScope();
    for (const scope of [projectP1, courseC1, classK1]) {
      expect(builderAccessDecision(scope, "read", bs)).toBe("deny_not_found");
      expect(builderAccessDecision(scope, "write", bs)).toBe("deny_not_found");
    }
  });

  it("scopeCovered agrees with the decision for the allow cases", () => {
    const bs = projectAllocation();
    expect(scopeCovered(projectP1, "write", bs)).toBe(true);
    expect(scopeCovered(projectP2, "read", bs)).toBe(false);
  });
});
