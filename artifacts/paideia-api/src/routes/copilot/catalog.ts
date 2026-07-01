import { Router, type IRouter } from "express";
import { REGIONS } from "../../lib/catalog.js";

const router: IRouter = Router();

router.get("/", (_req, res) => {
  res.json({ regions: REGIONS });
});

export default router;
