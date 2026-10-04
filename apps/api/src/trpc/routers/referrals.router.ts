import { referralSummary } from "../../services/referrals.service.js";
import { protectedProcedure, router } from "../init.js";

/** Parrainage (REF-001) : le code du joueur, ses parrainés et ce qu'ils lui ont rapporté. */
export const referralsRouter = router({
  mine: protectedProcedure.query(({ ctx }) =>
    referralSummary(ctx.identity.playerId),
  ),
});
