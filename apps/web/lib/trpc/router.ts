import { router } from "./trpc";
import { groupsRouter } from "./routers/groups";
import { threadsRouter } from "./routers/threads";
import { messagesRouter } from "./routers/messages";
import { invitesRouter } from "./routers/invites";
import { onboardingRouter } from "./routers/onboarding";
import { profileRouter } from "./routers/profile";
import { searchRouter } from "./routers/search";
import { pollsRouter } from "./routers/polls";
import { smetersRouter } from "./routers/smeters";
import { notificationsRouter } from "./routers/notifications";
import { linksRouter } from "./routers/links";
import { calendarRouter } from "./routers/calendar";

export const appRouter = router({
  groups: groupsRouter,
  threads: threadsRouter,
  messages: messagesRouter,
  invites: invitesRouter,
  onboarding: onboardingRouter,
  profile: profileRouter,
  search: searchRouter,
  polls: pollsRouter,
  smeters: smetersRouter,
  notifications: notificationsRouter,
  links: linksRouter,
  calendar: calendarRouter,
});

export type AppRouter = typeof appRouter;
