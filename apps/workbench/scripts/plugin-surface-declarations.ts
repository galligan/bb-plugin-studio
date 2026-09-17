import ts from "typescript";
import { surfaceCatalog } from "../src/surface-catalog";

function memberName(
  name: ts.PropertyName,
  source: ts.SourceFile,
  context: string,
): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  throw new Error(
    `Computed or non-string registration name is unsupported in ${context}: ${name.getText(source)}`,
  );
}

export function extractRegistrationPaths(sourceText: string): string[] {
  const fileName = "/bb-plugin-sdk-app.d.ts";
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const compilerOptions: ts.CompilerOptions = {
    noEmit: true,
    noLib: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.Latest,
  };
  const defaultHost = ts.createCompilerHost(compilerOptions);
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists: (path) => path === fileName || defaultHost.fileExists(path),
    getSourceFile: (path, languageVersion) =>
      path === fileName
        ? sourceFile
        : defaultHost.getSourceFile(path, languageVersion),
    readFile: (path) =>
      path === fileName ? sourceText : defaultHost.readFile(path),
  };
  const program = ts.createProgram([fileName], compilerOptions, host);
  const source = program.getSourceFile(fileName);
  if (!source) throw new Error("Could not load plugin SDK declarations");
  const diagnostics = program.getSyntacticDiagnostics(source);
  if (diagnostics.length > 0) {
    const detail = diagnostics
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
      )
      .join("; ");
    throw new Error(`Could not parse plugin SDK declarations: ${detail}`);
  }

  const interfaces = new Map<string, ts.InterfaceDeclaration[]>();
  const aliases = new Map<string, ts.TypeAliasDeclaration[]>();
  for (const statement of source.statements) {
    if (ts.isInterfaceDeclaration(statement)) {
      const declarations = interfaces.get(statement.name.text) ?? [];
      declarations.push(statement);
      interfaces.set(statement.name.text, declarations);
    } else if (ts.isTypeAliasDeclaration(statement)) {
      const declarations = aliases.get(statement.name.text) ?? [];
      declarations.push(statement);
      aliases.set(statement.name.text, declarations);
    }
  }

  const collectTypeMembers = (
    type: ts.TypeNode,
    seen: ReadonlySet<string>,
  ): ts.TypeElement[] => {
    if (ts.isParenthesizedTypeNode(type))
      return collectTypeMembers(type.type, seen);
    if (ts.isTypeLiteralNode(type)) return [...type.members];
    if (ts.isIntersectionTypeNode(type)) {
      return type.types.flatMap((part) => collectTypeMembers(part, seen));
    }
    if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) {
      throw new Error(
        `Could not resolve registration family type: ${type.getText(source)}`,
      );
    }

    const typeName = type.typeName.text;
    if (seen.has(typeName)) return [];
    const nextSeen = new Set(seen).add(typeName);
    const interfaceDeclarations = interfaces.get(typeName) ?? [];
    const aliasDeclarations = aliases.get(typeName) ?? [];
    if (interfaceDeclarations.length === 0 && aliasDeclarations.length === 0) {
      throw new Error(
        `Could not resolve registration family type: ${typeName}`,
      );
    }

    const inherited = interfaceDeclarations.flatMap((declaration) =>
      (declaration.heritageClauses ?? []).flatMap((clause) =>
        clause.types.flatMap((heritageType) => {
          if (!ts.isIdentifier(heritageType.expression)) {
            throw new Error(
              `Could not resolve inherited registration family: ${heritageType.getText(source)}`,
            );
          }
          return collectTypeMembers(
            ts.factory.createTypeReferenceNode(heritageType.expression.text),
            nextSeen,
          );
        }),
      ),
    );

    return [
      ...inherited,
      ...interfaceDeclarations.flatMap((declaration) => [
        ...declaration.members,
      ]),
      ...aliasDeclarations.flatMap((declaration) =>
        collectTypeMembers(declaration.type, nextSeen),
      ),
    ];
  };

  const builderDeclarations = interfaces.get("PluginAppBuilder") ?? [];
  if (builderDeclarations.length === 0) {
    throw new Error("Could not resolve PluginAppBuilder declarations");
  }
  const builderMembers = collectTypeMembers(
    ts.factory.createTypeReferenceNode("PluginAppBuilder"),
    new Set(),
  );
  const paths: string[] = [];
  const seenPaths = new Set<string>();
  const checker = program.getTypeChecker();

  const safeBuilderMetadata = (type: ts.TypeNode): boolean =>
    type.kind === ts.SyntaxKind.StringKeyword ||
    type.kind === ts.SyntaxKind.NumberKeyword ||
    type.kind === ts.SyntaxKind.BooleanKeyword ||
    type.kind === ts.SyntaxKind.BigIntKeyword ||
    type.kind === ts.SyntaxKind.SymbolKeyword ||
    type.kind === ts.SyntaxKind.NullKeyword ||
    type.kind === ts.SyntaxKind.UndefinedKeyword ||
    ts.isLiteralTypeNode(type);

  const propertyIsCallable = (
    member: ts.PropertySignature,
    familyName: string,
    registrationName: string,
  ): boolean => {
    if (!member.type) {
      throw new Error(
        `Could not classify PluginAppBuilder family "${familyName}" member "${registrationName}": missing type`,
      );
    }
    const memberType = checker.getTypeAtLocation(member);
    if (
      checker.getSignaturesOfType(memberType, ts.SignatureKind.Call).length > 0
    ) {
      return true;
    }
    if (memberType.isUnionOrIntersection()) {
      const everyPartCallable = memberType.types.every(
        (part) =>
          checker.getSignaturesOfType(part, ts.SignatureKind.Call).length > 0,
      );
      if (everyPartCallable) return true;
      throw new Error(
        `Could not classify PluginAppBuilder family "${familyName}" member "${registrationName}": mixed callable and non-callable type`,
      );
    }
    if ((memberType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
      throw new Error(
        `Could not classify PluginAppBuilder family "${familyName}" member "${registrationName}": unresolved or unsafe type`,
      );
    }
    return false;
  };

  for (const familyMember of builderMembers) {
    if (!ts.isPropertySignature(familyMember) || !familyMember.type) continue;
    const familyName = memberName(
      familyMember.name,
      source,
      "PluginAppBuilder",
    );
    if (safeBuilderMetadata(familyMember.type)) continue;
    let members: ts.TypeElement[];
    try {
      members = collectTypeMembers(familyMember.type, new Set());
    } catch (error) {
      throw new Error(
        `Could not resolve PluginAppBuilder family "${familyName}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    for (const registrationMember of members) {
      if (!registrationMember.name) {
        throw new Error(
          `Could not classify unnamed PluginAppBuilder family "${familyName}" member`,
        );
      }
      const registrationName = memberName(
        registrationMember.name,
        source,
        `PluginAppBuilder family "${familyName}"`,
      );
      const callable = ts.isMethodSignature(registrationMember)
        ? true
        : ts.isPropertySignature(registrationMember)
          ? propertyIsCallable(registrationMember, familyName, registrationName)
          : false;
      if (!callable) continue;
      const path = `${familyName}.${registrationName}`;
      if (!seenPaths.has(path)) {
        paths.push(path);
        seenPaths.add(path);
      }
    }
  }

  return paths;
}

export function compareDeclarationCoverage(
  sourceText: string,
  catalogPaths: readonly string[] = surfaceCatalog.map(
    ({ registrationPath }) => registrationPath,
  ),
) {
  const declarations = extractRegistrationPaths(sourceText);
  const declarationSet = new Set(declarations);
  const catalogSet = new Set(catalogPaths);
  return {
    absentFromDeclarations: catalogPaths.filter(
      (path) => !declarationSet.has(path),
    ),
    uncatalogedDeclarations: declarations.filter(
      (path) => !catalogSet.has(path),
    ),
  };
}

export function assertDeclarationCoverage(
  sourceText: string,
  catalogPaths?: readonly string[],
): void {
  const coverage = compareDeclarationCoverage(sourceText, catalogPaths);
  const failures: string[] = [];
  if (coverage.absentFromDeclarations.length > 0) {
    failures.push(
      `Catalog entries absent from declarations: ${coverage.absentFromDeclarations.join(", ")}`,
    );
  }
  if (coverage.uncatalogedDeclarations.length > 0) {
    failures.push(
      `Uncataloged declaration groups: ${coverage.uncatalogedDeclarations.join(", ")}`,
    );
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

if (import.meta.main) {
  const declarationPath = Bun.argv[2];
  if (!declarationPath) {
    throw new Error(
      "Pass an explicit @get-bb/plugin-sdk/app declaration path; no sibling fallback is used.",
    );
  }
  const declaration = Bun.file(declarationPath);
  if (!(await declaration.exists())) {
    throw new Error(`Declaration file does not exist: ${declarationPath}`);
  }
  assertDeclarationCoverage(await declaration.text());
  console.log(
    `Catalog covers all ${surfaceCatalog.length} public frontend registration groups.`,
  );
}
