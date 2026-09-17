import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// NextAuth v4 をApp Routerで使う構成。1つのハンドラーをGET/POST両方にexportする。
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
