import { createContext, useContext } from "react";

export const SiteContext = createContext({ name: "" });
export const useSite = () => useContext(SiteContext);
