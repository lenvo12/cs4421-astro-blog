import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			author: reference('authors'),
		}),
});

const authors = defineCollection({
	loader: glob({ base: './src/content/authors', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			name: z.string(),
			title: z.string().optional(),
			bio: z.string(),
			avatar: image(),
			socialLinks: z
				.array(
					z.object({
						label: z.string(),
						url: z.url(),
					}),
				)
				.optional(),
			socials: z
				.array(
					z.object({
						label: z.string(),
						url: z.url(),
					}),
				)
				.optional(),
		}),
});

export const collections = { blog, authors };
