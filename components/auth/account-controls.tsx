"use client";

import { useEffect } from "react";
import Link from "next/link";
import { UserButton, useAuth, useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import styles from "@/components/homepage/homepage.module.css";

let identifiedUserId: string | null = null;

export function AccountControls() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !userId) {
      if (identifiedUserId) {
        posthog.reset();
        identifiedUserId = null;
      }
      return;
    }

    if (identifiedUserId === userId) return;

    if (identifiedUserId) {
      posthog.reset();
    }

    posthog.identify(userId, {
      ...(user?.primaryEmailAddress?.emailAddress
        ? { email: user.primaryEmailAddress.emailAddress }
        : {}),
      ...(user?.fullName ? { name: user.fullName } : {}),
    });
    identifiedUserId = userId;
  }, [isLoaded, isSignedIn, user, userId]);

  if (!isLoaded) {
    return <span className={styles.authLoading} role="status">Loading account…</span>;
  }

  if (isSignedIn) {
    return <UserButton />;
  }

  return (
    <>
      <Link className={styles.login} href="/sign-in">Login</Link>
      <Link className={styles.signUp} href="/sign-up">Sign up</Link>
    </>
  );
}
