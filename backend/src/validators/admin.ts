import { z } from "zod";

export const grantAdminBody = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

export const userIdParams = z.strictObject({ userId: z.uuid() });
