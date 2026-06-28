import { useParams, Link } from "wouter";
import { usePageMeta } from "@/lib/seo";
import { insightsData } from "@/lib/insights-data";
import { format, parseISO } from "date-fns";
import { ArrowLeft } from "lucide-react";
import NotFound from "@/pages/not-found";

export default function InsightArticle() {
  const { slug } = useParams<{ slug: string }>();
  const post = insightsData.find(p => p.slug === slug);
  
  usePageMeta(post?.title || "Insight", post?.excerpt);

  if (!post) {
    return <NotFound />;
  }

  const relatedPosts = insightsData.filter(p => p.slug !== slug).slice(0, 2);

  return (
    <article className="mx-auto max-w-3xl px-4 py-24">
      <div className="mb-12 space-y-6 border-b border-border pb-12">
        <Link href="/insights" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Insights
        </Link>
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">{post.practice}</p>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-balance">{post.title}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground pt-4">
            <span className="font-medium text-foreground">{post.author}</span>
            <span>&bull;</span>
            <time dateTime={post.date}>{format(parseISO(post.date), "MMMM d, yyyy")}</time>
          </div>
        </div>
      </div>

      <div className="prose prose-lg dark:prose-invert max-w-none">
        {post.body.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {relatedPosts.length > 0 && (
        <div className="mt-24 pt-12 border-t border-border">
          <h2 className="text-2xl font-bold mb-8">Related reading</h2>
          <div className="grid sm:grid-cols-2 gap-8">
            {relatedPosts.map(rp => (
              <div key={rp.slug} className="space-y-2 group">
                <Link href={`/insights/${rp.slug}`}>
                  <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">{rp.title}</h3>
                </Link>
                <p className="text-sm text-muted-foreground line-clamp-2">{rp.excerpt}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}