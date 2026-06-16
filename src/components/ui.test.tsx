import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDeleteModal } from "./ui";

describe("shared UI components", () => {
  it("keeps delete confirmation actions explicit", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteModal
        title="删除资源"
        description="确认删除 Demo"
        confirmLabel="删除"
        onClose={onClose}
        onConfirm={onConfirm}
      >
        <p>删除后不可恢复。</p>
      </ConfirmDeleteModal>
    );

    expect(screen.getByRole("dialog", { name: "删除资源" })).toBeInTheDocument();
    expect(screen.getByText("删除后不可恢复。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "删除" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
