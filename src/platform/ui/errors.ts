import { notFound } from "next/navigation";
import { NotFoundError } from "@/platform/authz/errors";

/** For pages: turn an out-of-scope / missing row (NotFoundError) into a 404 page. */
export async function notFoundOnMissing<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}
