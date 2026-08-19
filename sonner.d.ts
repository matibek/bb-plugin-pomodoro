declare module "sonner" {
  export const toast: {
    (message: string, options?: { description?: string }): void;
    success(message: string): void;
    error(message: string): void;
  };
}
