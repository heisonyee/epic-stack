import closeWithGrace from 'close-with-grace'
import { rest } from 'msw'
import { setupServer } from 'msw/node'
import { handlers as githubHandlers } from './github.ts'
import { handlers as resendHandlers } from './resend.ts'

const miscHandlers = [
	process.env.REMIX_DEV_ORIGIN
		? rest.post(`${process.env.REMIX_DEV_ORIGIN}ping`, (req, res, ctx) => { return res(ctx.status(302), ctx.text('Passthrough')) })
		: null,
].filter(Boolean)

export const server = setupServer(
	...miscHandlers,
	...resendHandlers,
	...githubHandlers,
)

server.listen({ onUnhandledRequest: 'warn' })

if (process.env.NODE_ENV !== 'test') {
	console.info('🔶 Mock server installed')

	closeWithGrace(() => {
		server.close()
	})
}
