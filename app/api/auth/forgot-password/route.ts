
import { NextResponse } from "next/server";
import { jsonAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? "").trim();

    const result = await jsonAuth.requestPasswordReset(email);

    // Console delivery: development only.
    if (result && process.env.NODE_ENV === "development") {
      const resetUrl = new URL("/reset-password", request.url);
      resetUrl.searchParams.set("token", result.token);

      console.info("\n========== MED EASY PASSWORD RESET ==========");
      console.info("Account:", result.email);
      console.info("Reset URL:", resetUrl.toString());
      console.info("Expires in: 15 minutes");
      console.info("==============================================\n");
    }

    return NextResponse.json(
      {
        success: true,
        message:
          "If an account exists, a password reset link has been generated.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Forgot password error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to process your request. Please try again.",
      },
      { status: 500 }
    );
  }
}
