import { usePageMeta } from "@/lib/seo";
import { Link } from "wouter";
import { insightsData } from "@/lib/insights-data";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";

export default function Insights() {
  usePageMeta("Insights", "Articles and perspectives from Synops Consulting Group.");
  return (
    <div className="mx-auto max-w-5xl px-4 py-24 space-y-16">
      <div className="space-y-4">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Insights</h1>
        <p className="text-xl text-muted-foreground max-w-2xl">
          Perspectives on healthcare operations, learning science, and technical implementation from our principals.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {insightsData.map((post) => (
          <Card key={post.slug} className="flex flex-col hover:shadow-md transition-shadow group h-full">
            <CardHeader>
              <div className="flex justify-between items-start mb-4">
                <Badge variant="outline" className="bg-muted/50">{post.practice}</Badge>
              </div>
              <CardTitle className="text-xl leading-tight group-hover:text-primary transition-colors">
                <Link href={`/insights/${post.slug}`}>{post.title}</Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-muted-foreground text-sm line-clamp-3">
                {post.excerpt}
              </p>
            </CardContent>
            <CardFooter className="text-xs text-muted-foreground border-t border-border/50 pt-4 flex justify-between">
              <span>{post.author}</span>
              <time dateTime={post.date}>{format(parseISO(post.date), "MMM d, yyyy")}</time>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}