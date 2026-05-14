import Router from "@koa/router"
import {
  deleteHistoryHandler,
  getHistoryDetailHandler,
  getHistoryListHandler,
} from "../controller/historyController.js"

const router = new Router({ prefix: "/history" })

router.get("/", getHistoryListHandler)
router.get("/:sessionId", getHistoryDetailHandler)
router.post("/delete", deleteHistoryHandler)

export default router
