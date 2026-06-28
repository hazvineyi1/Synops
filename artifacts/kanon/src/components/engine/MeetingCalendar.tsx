import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import type { ActionItem, Meeting } from "@workspace/kanon-api-client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";

type CalendarEvent = {
  date: Date;
  label: string;
  kind: "meeting" | "next" | "due";
};

const KIND_STYLES: Record<CalendarEvent["kind"], string> = {
  meeting: "bg-primary/10 text-primary",
  next: "bg-emerald-100 text-emerald-800",
  due: "bg-amber-100 text-amber-800",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A read-only month calendar derived entirely from existing data: scheduled
 * meetings, the proposed next meeting, and action item due dates. No new endpoint
 * is involved. Navigation is keyboard reachable and every control is labelled.
 */
export function MeetingCalendar({
  meetings,
  actionItems,
  nextMeetingAt,
}: {
  meetings: Meeting[];
  actionItems: ActionItem[];
  nextMeetingAt?: string | null;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const events = useMemo<CalendarEvent[]>(() => {
    const list: CalendarEvent[] = [];
    for (const m of meetings) {
      if (m.scheduledAt) list.push({ date: new Date(m.scheduledAt), label: m.title, kind: "meeting" });
    }
    if (nextMeetingAt) list.push({ date: new Date(nextMeetingAt), label: "Proposed next meeting", kind: "next" });
    for (const a of actionItems) {
      if (a.dueAt && a.status === "open") list.push({ date: new Date(a.dueAt), label: `Due: ${a.title}`, kind: "due" });
    }
    return list;
  }, [meetings, actionItems, nextMeetingAt]);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor));
    const gridEnd = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [cursor]);

  const eventsForDay = (day: Date) => events.filter((e) => isSameDay(e.date, day));

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border bg-card px-5 py-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <CardTitle className="text-lg">Calendar</CardTitle>
            <CardDescription className="m-0">Scheduled meetings and what is due</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setCursor((c) => subMonths(c, 1))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="w-36 text-center text-sm font-semibold" aria-live="polite">
            {format(cursor, "MMMM yyyy")}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setCursor((c) => addMonths(c, 1))}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
            Today
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div role="grid" aria-label={`Calendar for ${format(cursor, "MMMM yyyy")}`}>
          <div role="row" className="grid grid-cols-7">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                role="columnheader"
                className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const inMonth = isSameMonth(day, cursor);
              const dayEvents = eventsForDay(day);
              const today = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  role="gridcell"
                  aria-label={`${format(day, "EEEE, MMMM d, yyyy")}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length > 1 ? "s" : ""}` : ""}`}
                  className={`min-h-[5.5rem] rounded-lg border p-1.5 ${
                    inMonth ? "border-border bg-card" : "border-transparent bg-muted/20 text-muted-foreground"
                  } ${today ? "ring-2 ring-inset ring-primary/40" : ""}`}
                >
                  <div className={`mb-1 text-right text-xs ${today ? "font-bold text-primary" : "text-muted-foreground"}`}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((e, i) => (
                      <div
                        key={i}
                        className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${KIND_STYLES[e.kind]}`}
                        title={e.label}
                      >
                        {e.label}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="px-1.5 text-[11px] text-muted-foreground">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" /> Meeting
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" /> Proposed next meeting
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" /> Action item due
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
