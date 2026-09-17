import { describe, expect, test } from "bun:test";
import {
  assertDeclarationCoverage,
  compareDeclarationCoverage,
  extractRegistrationPaths,
} from "../scripts/plugin-surface-declarations";

const declaration = `
  type AliasedRegistration = (registration: unknown) => void;
  type CallableObjectRegistration = {
    <T>(registration: T): void;
    description: string;
  };
  type UnionRegistration =
    | ((registration: string) => void)
    | ((registration: number) => void);
  type IntersectionRegistration =
    ((registration: unknown) => void) & { description: string };
  interface SharedSlots {
    inherited(registration: unknown): void;
    overloaded(registration: unknown): void;
    overloaded(registration: unknown, options?: unknown): void;
    label: string;
    parenthesized: ((registration: unknown) => void);
    aliased: AliasedRegistration;
    callableObject: CallableObjectRegistration;
    generic: <T>(registration: T) => void;
    union: UnionRegistration;
    intersection: IntersectionRegistration;
  }
  interface PluginAppSlots extends SharedSlots {
    homepageSection(registration: unknown): void;
  }
  interface PluginAppSlots {
    propertyRegistration: (registration: unknown) => void;
  }
  interface PluginAppComposer {
    customize(registration: unknown): void;
  }
  interface PluginAppContentScripts {
    register(registration: unknown): void;
  }
  interface PluginAppTelemetry {
    observe: (registration: unknown) => void;
  }
  interface PluginAppBuilder {
    sdkVersion: string;
    slots: PluginAppSlots;
    composer: PluginAppComposer;
    contentScripts: PluginAppContentScripts;
    telemetry: PluginAppTelemetry;
  }
`;

describe("plugin surface declaration coverage", () => {
  test("discovers merged, inherited, overloaded, and function-property registrations through PluginAppBuilder", () => {
    expect(extractRegistrationPaths(declaration)).toEqual([
      "slots.inherited",
      "slots.overloaded",
      "slots.parenthesized",
      "slots.aliased",
      "slots.callableObject",
      "slots.generic",
      "slots.union",
      "slots.intersection",
      "slots.homepageSection",
      "slots.propertyRegistration",
      "composer.customize",
      "contentScripts.register",
      "telemetry.observe",
    ]);
  });

  test("fails closed for syntax errors and unresolvable builder families", () => {
    expect(() =>
      extractRegistrationPaths("interface PluginAppBuilder {"),
    ).toThrow("Could not parse plugin SDK declarations");
    expect(() =>
      extractRegistrationPaths(`
        interface PluginAppBuilder { missing: MissingFamily }
      `),
    ).toThrow('Could not resolve PluginAppBuilder family "missing"');
    expect(() =>
      extractRegistrationPaths(`
        declare const registrationName: unique symbol;
        interface PluginAppSlots {
          [registrationName](registration: unknown): void;
        }
        interface PluginAppBuilder { slots: PluginAppSlots }
      `),
    ).toThrow("Computed or non-string registration name is unsupported");
    expect(() =>
      extractRegistrationPaths(`
        interface PluginAppSlots {
          uncertain: MissingRegistrationType;
        }
        interface PluginAppBuilder { slots: PluginAppSlots }
      `),
    ).toThrow(
      'Could not classify PluginAppBuilder family "slots" member "uncertain"',
    );
  });

  test("fails for stale catalog entries and new upstream registration groups", () => {
    expect(() =>
      assertDeclarationCoverage(declaration, ["slots.homepageSection"]),
    ).toThrow("Uncataloged declaration groups: slots.inherited");
  });

  test("covers the committed Studio plugin SDK declaration in the normal test gate", async () => {
    const snapshot = Bun.file(
      new URL(
        "../../../plugins/studio/node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk-app.d.ts",
        import.meta.url,
      ),
    );

    expect(await snapshot.exists()).toBe(true);
    const coverage = compareDeclarationCoverage(await snapshot.text());
    expect(coverage.absentFromDeclarations).toEqual([]);
    expect(coverage.uncatalogedDeclarations).toEqual([
      "experimental_icons.register",
      "slots.experimental_appOverlay",
      "slots.experimental_newThreadPanelAction",
      "slots.experimental_sidebarNavigation",
      "slots.experimental_sourceCodeRenderer",
      "slots.experimental_diffRenderer",
      "slots.commandPaletteAction",
      "slots.experimental_providerIcon",
      "slots.experimental_timelineRenderer",
      "slots.experimental_environmentProviderInputs",
      "slots.experimental_machineProviderInputs",
      "experimental_sidebarFooter.register",
    ]);
  });
});
