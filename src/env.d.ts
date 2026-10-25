/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly DEVELOPER_ACCESS_PASSWORD?: string;
	readonly DEVELOPER_ACCESS_SECRET?: string;
}

declare namespace App {
	interface Locals {
		isDeveloper: boolean;
	}
}
