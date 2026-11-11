// このアプリが読む Queria のデータセット
import { createQueria } from "./kit/db";

export const { query, preload } = createQueria(["codh", "e_stat", "reinfolib"]);
