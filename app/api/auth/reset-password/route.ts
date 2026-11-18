
import { NextResponse } from "next/server";
import { jsonAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const token = body?.token;
    const password = body?.password;

    if (
      typeof token !== "string" ||
      typeof password !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Token and new password are required.",
        },
        { status: 400 }
      );
    }

    const result = await jsonAuth.resetPassword({
      token,
      password,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;

    const message =
      status !== 500 && error instanceof Error
        ? error.message
        : "Unable to reset password. Please try again.";

    if (status === 500) {
      console.error("Reset password error:", error);
    }

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
