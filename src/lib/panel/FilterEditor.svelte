<script lang="ts">
  /**
   * Filter editor for the selected layer: a list of "field operator value"
   * conditions, combined with AND ("all") or OR ("any"). Only matching
   * features are drawn, listed in the attribute table and found by search.
   * The rules are in lib/filter.ts.
   */
  import { numericFieldsOf } from "../features";
  import { filterPredicate, isActive, isIncomplete, needsValue, OPERATORS, type Condition, type LayerFilter } from "../filter";
  import type { LayerList } from "../layers.svelte";
  import type { MapLayer } from "../map/types";
  import { uniqueCategories } from "../style/classify";

  interface Props {
    list: LayerList;
    layer: MapLayer;
  }
  let { list, layer }: Props = $props();

  let filter = $derived<LayerFilter>(layer.filter ?? { match: "all", conditions: [] });
  let fields = $derived(layer.data.fields);
  let numeric = $derived(numericFieldsOf(layer.data));
  let features = $derived(layer.data.geojson.features);
  let active = $derived(isActive(layer.filter, numeric));
  let matching = $derived.by(() => {
    const keep = filterPredicate(layer.filter, numeric);
    return features.filter((f) => keep(f.properties)).length;
  });

  function save(next: LayerFilter) {
    list.update(layer.id, { filter: next.conditions.length > 0 ? next : null });
  }

  function setCondition(index: number, changes: Partial<Condition>) {
    save({ ...filter, conditions: filter.conditions.map((c, i) => (i === index ? { ...c, ...changes } : c)) });
  }

  function addCondition() {
    save({ ...filter, conditions: [...filter.conditions, { field: fields[0] ?? "", operator: "=", value: "" }] });
  }

  function removeCondition(index: number) {
    save({ ...filter, conditions: filter.conditions.filter((_, i) => i !== index) });
  }

  /** Common values of a field, offered as suggestions while typing. */
  const suggestions = (field: string) =>
    uniqueCategories(features, field)
      .map((c) => c.value)
      .filter((v) => v !== "");
</script>

<section class="filter" aria-label="Layer filter">
  <h3>Filter</h3>
  {#if fields.length === 0}
    <p class="muted">This layer has no attributes to filter on.</p>
  {:else}
    {#if filter.conditions.length > 1}
      <label class="match">
        Match
        <select value={filter.match} onchange={(e) => save({ ...filter, match: e.currentTarget.value as "all" | "any" })}>
          <option value="all">all conditions (AND)</option>
          <option value="any">any condition (OR)</option>
        </select>
      </label>
    {/if}

    {#each filter.conditions as condition, index (index)}
      {@const listId = `filter-values-${layer.id}-${index}`}
      <div class="condition" class:incomplete={isIncomplete(condition, numeric)}>
        <select
          aria-label="Field"
          value={condition.field}
          onchange={(e) => setCondition(index, { field: e.currentTarget.value })}
        >
          {#each fields as field (field)}
            <option value={field}>{field}</option>
          {/each}
        </select>
        <select
          aria-label="Operator"
          class="operator"
          value={condition.operator}
          onchange={(e) => setCondition(index, { operator: e.currentTarget.value as Condition["operator"] })}
        >
          {#each OPERATORS as op (op.id)}
            <option value={op.id}>{op.label}</option>
          {/each}
        </select>
        {#if needsValue(condition.operator)}
          <input
            aria-label="Value"
            list={listId}
            value={condition.value}
            placeholder={numeric.has(condition.field) ? "number" : "text"}
            oninput={(e) => setCondition(index, { value: e.currentTarget.value })}
          />
          <datalist id={listId}>
            {#each suggestions(condition.field) as value (value)}
              <option {value}></option>
            {/each}
          </datalist>
        {/if}
        <button class="remove" aria-label="Remove condition" title="Remove condition" onclick={() => removeCondition(index)}
          >×</button
        >
      </div>
      {#if isIncomplete(condition, numeric)}
        <p class="hint">
          {numeric.has(condition.field) && condition.value.trim() !== "" && !["contains", "startsWith"].includes(condition.operator)
            ? `${condition.field} holds numbers; type a number.`
            : "Ignored until a value is typed."}
        </p>
      {/if}
    {/each}

    <div class="actions">
      <button onclick={addCondition}>+ Add condition</button>
      {#if filter.conditions.length > 0}
        <button onclick={() => save({ match: "all", conditions: [] })}>Clear</button>
      {/if}
    </div>
    {#if active}
      <p class="muted">Showing {matching.toLocaleString()} of {features.length.toLocaleString()} features.</p>
    {/if}
  {/if}
</section>

<style>
  h3 {
    font-size: 11px;
    margin: 12px 0 4px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .muted {
    color: var(--muted);
    margin: 4px 0;
    font-size: 12px;
  }
  .match {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 4px 0;
    color: var(--muted);
  }
  .match select {
    flex: 1;
    min-width: 0;
  }
  .condition {
    display: flex;
    gap: 4px;
    margin: 4px 0;
    align-items: center;
  }
  .condition select {
    flex: 1;
    min-width: 0;
  }
  .condition .operator {
    flex: 0 0 64px;
  }
  .condition input {
    flex: 1;
    min-width: 0;
  }
  .condition.incomplete input,
  .condition.incomplete select {
    border-color: #d4a72c;
  }
  .hint {
    margin: -2px 0 4px;
    font-size: 11px;
    color: #9a6700;
  }
  .remove {
    font-size: 15px;
    line-height: 1;
    color: var(--muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 2px;
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  select,
  input,
  button {
    font: inherit;
  }
</style>
