import { handleV1, type V1RouteContext } from '@/lib/api/v1-router'

export const runtime = 'nodejs'

export const GET = (request: Request, context: V1RouteContext) => handleV1(request, 'GET', context)
export const POST = (request: Request, context: V1RouteContext) => handleV1(request, 'POST', context)
export const PATCH = (request: Request, context: V1RouteContext) => handleV1(request, 'PATCH', context)
export const DELETE = (request: Request, context: V1RouteContext) => handleV1(request, 'DELETE', context)
