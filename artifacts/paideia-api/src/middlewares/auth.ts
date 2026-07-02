import { type Request, type Response, type NextFunction } from "express";
import {
  db,
  sessionsTable,
  teachersTable,
  studentSessionsTable,
  studentsTable,
  studySessionsTable,
  studyUsersTable,
  type Teacher,
  type Student,
  type StudyUser,
} from "@workspace/paideia-db";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, STUDENT_SESSION_COOKIE } from "../lib/auth.js";
import { STUDY_SESSION_COOKIE } from "../lib/studyAuth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      teacher?: Teacher;
      student?: Student;
      impersonator?: Teacher;
      studyUser?: StudyUser;
    }
  }
}

export async function loadTeacher(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    try {
      const sessionRows = await db
        .select({
          teacherId: sessionsTable.teacherId,
          impersonatedTeacherId: sessionsTable.impersonatedTeacherId,
          expiresAt: sessionsTable.expiresAt,
        })
        .from(sessionsTable)
        .where(eq(sessionsTable.token, token))
        .limit(1);
      const sessionRow = sessionRows[0];
      if (sessionRow && sessionRow.expiresAt > new Date()) {
        const [admin] = await db
          .select()
          .from(teachersTable)
          .where(eq(teachersTable.id, sessionRow.teacherId))
          .limit(1);
        if (admin) {
          req.teacher = admin;
          if (sessionRow.impersonatedTeacherId) {
            const [target] = await db
              .select()
              .from(teachersTable)
              .where(eq(teachersTable.id, sessionRow.impersonatedTeacherId))
              .limit(1);
            if (target) {
              req.impersonator = admin;
              req.teacher = target;
            }
          }
        }
      }
    } catch (err) {
      req.log?.warn({ err }, "session lookup failed");
    }
  }
  const studentToken = req.cookies?.[STUDENT_SESSION_COOKIE];
  if (studentToken) {
    try {
      const sessionRows = await db
        .select({
          studentId: studentSessionsTable.studentId,
          impersonatedStudentId: studentSessionsTable.impersonatedStudentId,
          expiresAt: studentSessionsTable.expiresAt,
        })
        .from(studentSessionsTable)
        .where(eq(studentSessionsTable.token, studentToken))
        .limit(1);
      const sessionRow = sessionRows[0];
      if (sessionRow && sessionRow.expiresAt > new Date()) {
        const [realStudent] = await db
          .select()
          .from(studentsTable)
          .where(eq(studentsTable.id, sessionRow.studentId))
          .limit(1);
        if (realStudent) {
          req.student = realStudent;
          if (sessionRow.impersonatedStudentId) {
            const [target] = await db
              .select()
              .from(studentsTable)
              .where(eq(studentsTable.id, sessionRow.impersonatedStudentId))
              .limit(1);
            if (target) {
              req.student = target;
            }
          }
        }
      }
    } catch (err) {
      req.log?.warn({ err }, "student session lookup failed");
    }
  }
  const studyToken = req.cookies?.[STUDY_SESSION_COOKIE];
  if (studyToken) {
    try {
      const sessionRows = await db
        .select({
          userId: studySessionsTable.userId,
          expiresAt: studySessionsTable.expiresAt,
        })
        .from(studySessionsTable)
        .where(eq(studySessionsTable.token, studyToken))
        .limit(1);
      const sessionRow = sessionRows[0];
      if (sessionRow && sessionRow.expiresAt > new Date()) {
        const [user] = await db
          .select()
          .from(studyUsersTable)
          .where(eq(studyUsersTable.id, sessionRow.userId))
          .limit(1);
        if (user) {
          // Self-healing entitlement: mobile-money and canceled subscriptions
          // have no renewal webhook, so when their paid period ends nothing flips
          // the stored tier back to free -- and feature gating reads that column.
          // Reconcile it lazily here. Stripe auto-renew (autoRenew=true) is left
          // to its own webhook, which advances the period or downgrades on lapse.
          const end = user.subscriptionCurrentPeriodEnd
            ? new Date(user.subscriptionCurrentPeriodEnd)
            : null;
          const expired = !!end && end.getTime() < Date.now();
          if (expired && user.subscriptionTier !== "free" && !user.autoRenew) {
            try {
              await db
                .update(studyUsersTable)
                .set({ subscriptionTier: "free", subscriptionStatus: "expired" })
                .where(eq(studyUsersTable.id, user.id));
            } catch (err) {
              req.log?.warn({ err }, "expiry downgrade failed");
            }
            user.subscriptionTier = "free";
            user.subscriptionStatus = "expired";
          }
          req.studyUser = user;
        }
      }
    } catch (err) {
      req.log?.warn({ err }, "study session lookup failed");
    }
  }
  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.teacher) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  next();
}

export function requireActiveTeacher(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.teacher) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  if (req.teacher.status === "suspended") {
    res.status(403).json({ error: "Your account has been suspended. Please contact the founder." });
    return;
  }
  next();
}

export function requireStudent(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.student) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  next();
}

export function requireStudyUser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.studyUser) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  next();
}

export function requireStudyAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.studyUser) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  if (!req.studyUser.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
