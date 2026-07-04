import { Redirect } from "wouter";
import { EngineApp } from "@/components/layout/EngineApp";
import { type Product } from "@/lib/products";

/**
 * Maps a product to its authenticated workspace. Routes here are relative to
 * the `/{key}` nest. Compass (Curriculum Builder) is the only product; an
 * unknown key falls back to the public site.
 */
export function ProductApp({ product }: { product: Product }) {
  switch (product.key) {
    case "compass":
      return <EngineApp />;

    default:
      return <Redirect to="~/" />;
  }
}
