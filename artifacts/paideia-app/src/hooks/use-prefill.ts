import { useSearch } from "wouter";
import { useMemo } from "react";

export interface Prefill {
  subject?: string;
  yearGroup?: string;
  topic?: string;
  fromPlanId?: string;
  fromPlanTitle?: string;
  studentId?: string;
  studentName?: string;
}

export function usePrefill(): Prefill {
  const search = useSearch();
  return useMemo(() => {
    const p = new URLSearchParams(search);
    const out: Prefill = {};
    const subject = p.get("subject"); if (subject) out.subject = subject;
    const yearGroup = p.get("yearGroup"); if (yearGroup) out.yearGroup = yearGroup;
    const topic = p.get("topic"); if (topic) out.topic = topic;
    const fromPlanId = p.get("fromPlanId"); if (fromPlanId) out.fromPlanId = fromPlanId;
    const fromPlanTitle = p.get("fromPlanTitle"); if (fromPlanTitle) out.fromPlanTitle = fromPlanTitle;
    const studentId = p.get("studentId"); if (studentId) out.studentId = studentId;
    const studentName = p.get("studentName"); if (studentName) out.studentName = studentName;
    return out;
  }, [search]);
}
