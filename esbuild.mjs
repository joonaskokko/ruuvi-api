import * as esbuild from 'esbuild'

await esbuild.build({
	entryPoints: [
		'./start.ts'
	],
	outfile: './dist/start.mjs',
	external: [
		'mysql', 'pg', 'pg-native', 'sqlite3', 'oracledb', 'mssql', 'oracledb', 'tedious', 'pg-query-stream', 'express', 'knex', 'mysql2', 'node-schedule', 'date-fns', 'dotenv-flow'
	],
	platform: 'node',
	target: 'node25',
	format: 'esm',
	conditions: ['node'],
  supported: {
		'top-level-await': true,
	},
	minify: true,
	bundle: true,
	write: true,
});