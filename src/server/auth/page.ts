/**
 * Identity for Server Components (pages): the same session as the API, read with next/headers cookies().
 * Kept apart from ./index.ts so route handlers (and their tests, which pass plain Requests) never need a request scope.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loginUrl, type User } from "@/contracts";
import { SESSION_COOKIE } from "./cookie";
import { userForToken } from "./users";

export async function currentUser(): Promise<User | undefined> {
  return userForToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** The signed-in user, or a redirect to /entrar?next=<path>. */
export async function requirePageUser(path: string): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(loginUrl(path));
  return user;
}
