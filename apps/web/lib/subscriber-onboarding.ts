import { z } from "zod";

export const subscriberOnboardingAnswersSchema = z.object({
  acquisitionSource: z.enum(["search", "tiktok", "instagram", "threads", "referral", "other"]),
  weeklyPositionFrequency: z.enum(["none", "one_two", "three_five", "six_ten", "eleven_plus"]),
  primaryGoal: z.enum(["compare_strategies", "learn_trading", "improve_risk", "get_alerts"]),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced", "professional"])
});

export const subscriberOnboardingStatusSchema = z.discriminatedUnion("completed", [
  z.object({ completed: z.literal(false) }),
  subscriberOnboardingAnswersSchema.extend({
    completed: z.literal(true),
    completedAt: z.string()
  })
]);

export type SubscriberOnboardingAnswers = z.infer<typeof subscriberOnboardingAnswersSchema>;
export type SubscriberOnboardingStatus = z.infer<typeof subscriberOnboardingStatusSchema>;
