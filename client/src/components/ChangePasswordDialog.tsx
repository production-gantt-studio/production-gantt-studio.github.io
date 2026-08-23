import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { requireSupabaseClient } from "@/lib/supabaseClient";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("パスワードは8文字以上にしてください。");
      return;
    }
    if (password !== confirm) {
      toast.error("パスワードが一致しません。");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = requireSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("パスワードを変更しました。");
      setPassword("");
      setConfirm("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "パスワードを変更できませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>パスワードを変更</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <Input
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="新しいパスワード(8文字以上)"
            aria-label="新しいパスワード"
          />
          <Input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="新しいパスワード(確認)"
            aria-label="新しいパスワード(確認)"
          />
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "変更中" : "変更する"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
