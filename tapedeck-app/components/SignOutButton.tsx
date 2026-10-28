"use client";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../lib/supabase";

export default function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.push("/");
    router.refresh();
  }
  return (
    <button className="btn secondary" onClick={signOut}>
      SIGN OUT
    </button>
  );
}
