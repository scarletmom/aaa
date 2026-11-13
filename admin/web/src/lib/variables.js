import { useEffect, useState } from "react";
import { api } from "./api.js";

let namesPromise = null;

// Names only: the browser never receives variable values.
export function loadVariableNames() {
  namesPromise ||= api("/api/variables")
    .then((data) => [...data.items.filter((item) => item.readable).map((item) => item.name), ...data.fromEnv.map((item) => item.name)].sort())
    .catch((err) => {
      namesPromise = null;
      throw err;
    });
  return namesPromise;
}

export const forgetVariables = () => {
  namesPromise = null;
};

export function useVariableNames() {
  const [names, setNames] = useState([]);
  useEffect(() => {
    let alive = true;
    loadVariableNames()
      .then((list) => alive && setNames(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return names;
}

// Stands in for $env in live previews, so {{ $env.NAME }} shows a mask instead of an error.
export const maskedEnv = (names) => Object.fromEntries(names.map((name) => [name, "••••••"]));
