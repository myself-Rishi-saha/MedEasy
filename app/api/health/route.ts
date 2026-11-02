export const runtime = 'nodejs'

export function GET() {
  return Response.json({
    success: true,
    message: 'Service is healthy',
    data: { status: 'ok', timestamp: new Date().toISOString() },
  })
}
