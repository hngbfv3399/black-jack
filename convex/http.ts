import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Register authentication routes (/api/auth/*)
auth.addHttpRoutes(http);

export default http;
