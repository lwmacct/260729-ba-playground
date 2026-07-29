export function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const errorFields = record.errorFields;
    if (Array.isArray(errorFields)) {
      const messages = errorFields.flatMap((field) => {
        if (!field || typeof field !== "object") {
          return [];
        }
        const errors = (field as { errors?: unknown }).errors;
        return Array.isArray(errors)
          ? errors.filter((message): message is string => typeof message === "string")
          : [];
      });
      if (messages.length > 0) {
        return messages.join("\n");
      }
    }
    for (const key of ["error", "detail", "title", "message"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}
