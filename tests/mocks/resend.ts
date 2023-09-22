import { faker } from '@faker-js/faker'
import { rest, type RequestHandler } from 'msw'
import { requireHeader, writeEmail } from './utils.ts'

export const handlers: Array<RequestHandler> = [
	rest.post(`https://api.resend.com/emails`, async (req, res, ctx) => {
		requireHeader(req.headers, 'Authorization')
		const body = await req.json()
		console.info('🔶 mocked email contents:', body)

		const email = await writeEmail(body)

		return res(
			ctx.json({
				id: faker.string.uuid(),
				from: email.from,
				to: email.to,
				created_at: new Date().toISOString(),
			})
		)
	}),
]
