import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { faker } from '@faker-js/faker'
import fsExtra from 'fs-extra'
import { rest, 
	type RequestHandler, 
	type MockedRequest,
} from 'msw'
import { passthrough } from './misc.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const here = (...s: Array<string>) => path.join(__dirname, ...s)

class GithubError extends Error {
	name: string
	message: string
	stack?: string | undefined
	cause?: unknown
	status: number

	constructor(name: string, status: number, message: string) {
		super()
		this.name = name
		this.message = message
		this.status = status
	}
}

const githubUserFixturePath = path.join(
	here(
		'..',
		'fixtures',
		'github',
		`users.${process.env.VITEST_POOL_ID || 0}.local.json`,
	),
)

await fsExtra.ensureDir(path.dirname(githubUserFixturePath))

function createGitHubUser(code?: string | null) {
	const createEmail = () => ({
		email: faker.internet.email(),
		verified: faker.datatype.boolean(),
		primary: false, // <-- can only have one of these
		visibility: faker.helpers.arrayElement(['public', null]),
	})
	const primaryEmail = {
		...createEmail(),
		verified: true,
		primary: true,
	}

	const emails = [
		{
			email: faker.internet.email(),
			verified: false,
			primary: false,
			visibility: 'public',
		},
		{
			email: faker.internet.email(),
			verified: true,
			primary: false,
			visibility: null,
		},
		primaryEmail,
	]

	code ??= faker.string.uuid()
	return {
		code,
		accessToken: `${code}_mock_access_token`,
		profile: {
			login: faker.internet.userName(),
			id: faker.string.uuid(),
			name: faker.person.fullName(),
			avatar_url: 'https://github.com/ghost.png',
			emails: emails.map(e => e.email),
		},
		emails,
		primaryEmail: primaryEmail.email,
	}
}

type GitHubUser = ReturnType<typeof createGitHubUser>

async function getGitHubUsers() {
	try {
		if (await fsExtra.pathExists(githubUserFixturePath)) {
			const json = await fsExtra.readJson(githubUserFixturePath)
			return json as Array<GitHubUser>
		}
		return []
	} catch (error) {
		console.error(error)
		return []
	}
}

export async function deleteGitHubUsers() {
	await fsExtra.remove(githubUserFixturePath)
}

async function setGitHubUsers(users: Array<GitHubUser>) {
	await fsExtra.writeJson(githubUserFixturePath, users, { spaces: 2 })
}

export async function insertGitHubUser(code?: string | null) {
	const githubUsers = await getGitHubUsers()
	let user = githubUsers.find(u => u.code === code)
	if (user) {
		Object.assign(user, createGitHubUser(code))
	} else {
		user = createGitHubUser(code)
		githubUsers.push(user)
	}
	await setGitHubUsers(githubUsers)
	return user
}

async function getUser(req: MockedRequest): Promise<GitHubUser> {
	const accessToken = req.headers
		.get('authorization')
		?.slice('token '.length)
	if (!accessToken) {
		throw new GithubError('Unauthorized', 401, 'Unauthorized')
	}
	const user = (await getGitHubUsers()).find(u => u.accessToken === accessToken)

	if (!user) {
		throw new GithubError('Not Found', 404, 'Not Found')
	}
	return user
}

// async function getUserHandle(req: MockedRequest): Promise<ResponseFunction> {
// 	const accessToken = req.headers
// 		.get('authorization')
// 		?.slice('token '.length)
	
// 	const resFn = createResponseComposition
// 	if (!accessToken) {
// 		return resFn({status: 401, statusText: 'Unauthorized', body: 'Unauthorized'})
// 	}
// 	const user = (await getGitHubUsers()).find(u => u.accessToken === accessToken)

// 	if (!user) {
// 		return resFn({status: 404, statusText: 'Not Found', body: 'Not Found'})
// 	}
// 	return resFn()
// }

const passthroughGitHub =
	!process.env.GITHUB_CLIENT_ID.startsWith('MOCK_') && !process.env.TESTING
export const handlers: Array<RequestHandler> = [
	rest.post(
		'https://github.com/login/oauth/access_token',
		async (req, res, ctx) => {
			if (passthroughGitHub) return res(ctx.status(302), ctx.text('Passthrough'))
			const params = new URLSearchParams(await req.text())

			const code = params.get('code')
			const githubUsers = await getGitHubUsers()
			let user = githubUsers.find(u => u.code === code)
			if (!user) {
				user = await insertGitHubUser(code)
			}

			return res(
				ctx.set('content-type', 'application/x-www-form-urlencoded')
			)
			// return new Response(
			// 	new URLSearchParams({
			// 		access_token: user.accessToken,
			// 		token_type: '__MOCK_TOKEN_TYPE__',
			// 	}).toString(),
			// 	{ headers: { } },
			// )
		},
	),
	rest.get('https://api.github.com/user/emails', async (req, res, ctx) => {
		if (passthroughGitHub) return passthrough()

		try {
			const user = await getUser(req)
			return res(ctx.json(user.emails))
		} catch(err) {
			if (err instanceof GithubError) {
				return res(ctx.status(err.status), ctx.text(err.message))
			}
		}
		return passthrough()
	}),
	rest.get('https://api.github.com/user/:id', async (req, res, ctx) => {
		if (passthroughGitHub) return passthrough()

		const params = req.params
		const mockUser = (await getGitHubUsers()).find(
			u => u.profile.id === params.id,
		)
		if (mockUser) return res(ctx.json(mockUser.profile))

		return res(ctx.status(404), ctx.text('Not Found'))
	}),
	rest.get('https://api.github.com/user', async (req, res, ctx) => {
		if (passthroughGitHub) return passthrough()

		try {
			const user = await getUser(req)
			return res(ctx.json(user.profile))
		} catch(err) {
			if (err instanceof GithubError) {
				return res(ctx.status(err.status), ctx.text(err.message))
			}
		}
		return passthrough()
	}),
	rest.get('https://github.com/ghost.png', async (req, res, ctx) => {
		if (passthroughGitHub) return passthrough()

		const buffer = await fsExtra.readFile('./tests/fixtures/github/ghost.jpg')
		return res(
			ctx.set('content-type', 'image/jpg'),
			ctx.body(buffer)
		)
	}),
]
