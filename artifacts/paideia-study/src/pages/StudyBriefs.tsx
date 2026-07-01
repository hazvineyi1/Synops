import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetStudyLatestBrief, useListStudyBriefs } from "@workspace/paideia-api-client";
import { TrendingUp, TrendingDown, Target, Calendar } from "lucide-react";
import StudyNav from "@/components/StudyNav";

export default function StudyBriefs() {
  const [, setLoc] = useLocation();
  const { data: latestBrief, isLoading: latestLoading } = useGetStudyLatestBrief();
  const { data: briefs, isLoading: listLoading } = useListStudyBriefs();

  return (
    <div className="min-h-screen bg-background">
      <StudyNav />

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="mb-8 text-center">
          <Calendar className="h-10 w-10 text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-bold">Weekly Briefs</h1>
          <p className="text-muted-foreground mt-1">
            Your progress at a glance.
          </p>
        </div>

        {/* Latest Brief */}
        {latestLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : latestBrief ? (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                This Week's Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed">{latestBrief.aiSummary}</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted p-3 rounded-lg text-center">
                  <p className="text-2xl font-bold">{latestBrief.flashcardsReviewed}</p>
                  <p className="text-xs text-muted-foreground">Flashcards Reviewed</p>
                </div>
                <div className="bg-muted p-3 rounded-lg text-center">
                  <p className="text-2xl font-bold">{latestBrief.practiceSessionsCompleted}</p>
                  <p className="text-xs text-muted-foreground">Practice Sessions</p>
                </div>
                <div className="bg-muted p-3 rounded-lg text-center">
                  <p className="text-2xl font-bold">{latestBrief.mockExamsTaken}</p>
                  <p className="text-xs text-muted-foreground">Mock Exams</p>
                </div>
                <div className="bg-muted p-3 rounded-lg text-center">
                  <p className="text-2xl font-bold">{Math.round(latestBrief.averageAccuracy * 100)}%</p>
                  <p className="text-xs text-muted-foreground">Avg Accuracy</p>
                </div>
              </div>

              {latestBrief.recommendations.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">Recommendations</h3>
                  <ul className="space-y-1">
                    {latestBrief.recommendations.map((r, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <TrendingUp className="h-3 w-3 text-primary mt-1 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {latestBrief.weakAreas.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2">Areas to Strengthen</h3>
                  <div className="flex flex-wrap gap-2">
                    {latestBrief.weakAreas.map((a) => (
                      <span key={a} className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Past Briefs */}
        <h2 className="text-lg font-bold mb-4">Past Weeks</h2>
        {listLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !briefs || briefs.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No past briefs yet.</p>
        ) : (
          <div className="space-y-3">
            {briefs.slice(1).map((brief) => (
              <Card key={brief.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">
                      {new Date(brief.weekStart).toLocaleDateString()} - {new Date(brief.weekEnd).toLocaleDateString()}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {Math.round(brief.averageAccuracy * 100)}% accuracy
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{brief.aiSummary}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
