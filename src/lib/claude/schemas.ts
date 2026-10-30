import * as z from "zod/v4";

export const ExtractedProblems = z.object({
  problems: z.array(
    z.object({
      number: z.string(),
      text: z.string(),
      concepts: z.array(z.string()),
      has_figure: z.boolean(),
      page: z.number().int(),
    }),
  ),
});

export const ProblemLinks = z.object({
  links: z.array(
    z.object({
      problem_id: z.string(),
      concepts: z.array(z.string()),
      passages: z.array(z.object({ passage_id: z.string(), reason: z.string() })),
      similar_exercise_ids: z.array(z.string()),
    }),
  ),
});
