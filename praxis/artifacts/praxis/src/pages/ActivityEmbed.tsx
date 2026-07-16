import React from "react";
import { useQuery } from "@tanstack/react-query";
import { getPublicActivity } from "@/lib/activitiesApi";
import { ActivityPlayer } from "@/components/ActivityPlayer";
import { Loader2 } from "lucide-react";

/**
 * Public, unauthenticated activity runner (route /a/:token). This is what a published embed
 * link resolves to — droppable into an LMS or website via an <iframe>. No account needed;
 * anonymous plays are not recorded (tracked completion is the authenticated assignment flow).
 */
export function ActivityEmbed({ params }: { params?: { token?: string } }) {
  const token = params?.token ?? "";
  const { data, isLoading, isError } = useQuery({ queryKey: ["public-activity", token], queryFn: () => getPublicActivity(token), enabled: !!token, retry: false });

  if (isLoading) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-white"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (isError || !data) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-white p-6 text-center"><p className="text-muted-foreground">This activity link is not available.</p></div>;
  }
  return (
    <div className="min-h-[100dvh] bg-white">
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <h1 className="text-xl font-serif font-bold mb-1">{data.title}</h1>
        {data.instructions && <p className="text-sm text-muted-foreground mb-4">{data.instructions}</p>}
        <ActivityPlayer html={data.html} embedUrl={data.embedUrl} />
      </div>
    </div>
  );
}
