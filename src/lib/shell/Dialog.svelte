<script lang="ts">
  /**
   * A modal dialog box (About, Preferences, Keyboard Shortcuts, Getting Offline
   * Maps). It uses the browser's own <dialog> element, which keeps the keyboard
   * focus inside it and closes on Esc. Clicking outside it closes it too.
   * The parent shows it by rendering it, and removes it in `onClose`.
   */
  import { onMount, type Snippet } from "svelte";

  interface Props {
    title: string;
    onClose: () => void;
    /** Widest it gets, in pixels (it's narrower in a small window). */
    width?: number;
    children: Snippet;
  }
  let { title, onClose, width = 480, children }: Props = $props();

  let dialog: HTMLDialogElement;
  onMount(() => dialog.showModal());
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (Esc closes it; the click is for the backdrop) -->
<dialog
  bind:this={dialog}
  aria-label={title}
  style:width="min({width}px, calc(100vw - 32px))"
  oncancel={(e) => {
    // Esc: let the parent remove the dialog, rather than the browser hiding it.
    e.preventDefault();
    onClose();
  }}
  onclick={(e) => {
    // The dialog has no padding of its own, so a click on it (not its contents) is on the backdrop.
    if (e.target === dialog) onClose();
  }}
>
  <div class="frame">
    <header>
      <h2>{title}</h2>
      <button class="close" aria-label="Close" onclick={onClose}>×</button>
    </header>
    {@render children()}
  </div>
</dialog>

<style>
  dialog {
    padding: 0;
    max-height: calc(100vh - 64px);
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgb(0 0 0 / 25%);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 25%);
  }
  .frame {
    padding: 12px 16px 16px;
  }
  header {
    display: flex;
    align-items: center;
    margin-bottom: 4px;
  }
  h2 {
    font-size: 15px;
    margin: 0;
    flex: 1;
  }
  .close {
    font: inherit;
    font-size: 18px;
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
</style>
