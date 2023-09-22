
import { createResponseComposition, type ResponseFunction, type DefaultBodyType } from 'msw'

export const passthrough: ResponseFunction<DefaultBodyType>= createResponseComposition({
    status: 302,
    statusText: 'Passthrough'
})