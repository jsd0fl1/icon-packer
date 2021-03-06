import {CodeComponent, CodeGenerationConfig} from './config';
import {createWriteStream, WriteStream} from 'fs';
import * as toConstantCase from 'to-constant-case';
import {join} from 'path';
import * as mkdirs from 'mkdirs';
import {copySync, formatDate, getClassName, getPackage, toGetter} from './utils';

const numberPrefixNames = [
    'ZERO_',
    'ONE',
    'TWO_',
    'THREE_',
    'FOUR_',
    'FIVE_',
    'SIX_',
    'SEVEN_',
    'EIGHT_',
    'NINE_'
];

export interface CodeGenerator {
    start(config: CodeGenerationConfig, distDir: string): void;

    writeIcon(icon: string, last: boolean): void;

    end(config: CodeGenerationConfig, setName: string): void;

    copyToSources(distDir: string, sourcesRoot: string, packageName: string, className: string): void;
}

abstract class AbstractCodeGenerator implements CodeGenerator {
    protected output: WriteStream;

    protected abstract readonly filenameExtension: string;
    protected abstract readonly supportsPropertyInConstructor: boolean;
    protected abstract readonly constructorInClassDeclaration: boolean;
    protected abstract readonly requireGetters: boolean;

    public start(config: CodeGenerationConfig, distDir: string): void {
        let codeFile = join(distDir, config.className + this.filenameExtension);
        this.output = createWriteStream(codeFile);
        this.output.write(`// DO NOT EDIT THIS FILE!
// This file was generated by icon-packer. To update your icon set
// run the icon-packer script again.\n`);
        this.openFile(config.package);
        this.writeSeparator();
        let imports = config.interfaces || [];
        if (config.createFunction) {
            imports = imports.concat(['com.vaadin.flow.component.icon.Icon']);
        }
        imports = imports.filter(className => getPackage(className) !== config.package);
        if (imports.length) {
            this.writeImports(imports);
            this.writeSeparator();
        }
        this.openEnum(config.className, config.interfaces ? config.interfaces.map(getClassName) : [], config.iconNameProperty);
    }

    public writeIcon(icon: string, last: boolean): void {
        let constantName = toConstantCase(icon);
        if (constantName.charCodeAt(0) >= 0x30 && constantName.charCodeAt(0) <= 0x39) {
            constantName = numberPrefixNames[parseInt(constantName[0])] + constantName.substring(1);
        }
        this.writeConstant(constantName, icon, last);
    }

    public end(config: CodeGenerationConfig, setName: string): void {
        let components: (() => void)[] = [];
        if (!this.supportsPropertyInConstructor) {
            components.push(() => this.writeProperty(config.iconNameProperty.name, config.iconNameProperty.override, 'String'));
        }

        if (!this.requireGetters && config.iconSetNameProperty) {
            components.push(() => this.writeProperty(config.iconSetNameProperty.name, config.iconSetNameProperty.override, 'String', setName));
        }

        if (!this.constructorInClassDeclaration) {
            components.push(() => this.writeConstructor(config.className, config.iconNameProperty));
        }

        if (this.requireGetters) {
            components.push(() => this.writeGetter(config.iconNameProperty.name, config.iconNameProperty.override, 'String'));
            if (config.iconSetNameProperty) {
                components.push(() => this.writeGetter(config.iconSetNameProperty.name, config.iconSetNameProperty.override, 'String', setName));
            }
        }

        if (config.createFunction) {
            components.push(() => {
                this.openMethod(config.createFunction.name, config.createFunction.override, 'Icon');
                this.writeCreateMethod(setName, config.iconNameProperty.name);
                this.closeMethod();
            });
        }

        components.forEach(renderer => {
            this.writeSeparator();
            renderer();
        });

        this.closeEnum();
        this.writeSeparator();
        this.output.end();
    }

    public copyToSources(distDir: string, sourcesRoot: string, packageName: string, className: string): void {
        let filename = className + this.filenameExtension;
        let packagePath = packageName.replaceAll('.', '/');
        let targetDir = join(sourcesRoot, packagePath);
        mkdirs(targetDir);
        copySync(join(distDir, filename), join(targetDir, filename));
    }

    protected abstract writeConstant(constantName: string, iconName: string, last: boolean): void;

    protected abstract openFile(packageName: string): void;

    protected abstract writeImports(classes: string[]): void;

    protected abstract openEnum(name: string, interfaces: string[], iconNameProperty: CodeComponent): void;

    protected closeEnum(): void {
        this.output.write('}');
    }

    protected abstract writeConstructor(className: string, iconNameProperty: CodeComponent);

    protected abstract openMethod(name: string, override: boolean, returnType: string): void

    protected closeMethod(): void {
        this.output.write('    }\n');
    }

    protected abstract writeProperty(name: string, override: boolean, type: string, value?: string): void;

    protected abstract writeGetter(name: string, override: boolean, type: string, value?: string): void;

    protected writeSeparator(): void {
        this.output.write('\n');
    }

    protected abstract writeCreateMethod(setName: string, iconNamePropertyName: string);
}

export class JavaCodeGenerator extends AbstractCodeGenerator {
    protected readonly filenameExtension: string = '.java';
    protected readonly supportsPropertyInConstructor: boolean = false;
    protected readonly constructorInClassDeclaration: boolean = false;
    protected readonly requireGetters: boolean = true;

    protected writeConstant(constantName: string, iconName: string, last: boolean): void {
        this.output.write(`    ${constantName}("${iconName}")${last ? ';' : ','}\n`);
    }

    protected openFile(packageName: string): void {
        this.output.write(`package ${packageName};\n`);
    }

    protected writeImports(classes: string[]): void {
        for (let className of classes) {
            this.output.write(`import ${className};\n`);
        }
    }

    protected openEnum(name: string, interfaces: string[], iconNameProperty: CodeComponent): void {
        this.output.write(`/**
 * Generated on ${formatDate(new Date())}
 */
public enum ${name} `);
        if (interfaces.length) {
            this.output.write(`implements ${interfaces.join(', ')} `);
        }
        this.output.write('{\n');
    }

    protected writeConstructor(className: string, iconNameProperty: CodeComponent): void {
        this.output.write(`    ${className}(String ${iconNameProperty.name}) {
        this.${iconNameProperty.name} = ${iconNameProperty.name};        
    }\n`);
    }

    protected openMethod(name: string, override: boolean, returnType: string): void {
        if (override) {
            this.output.write('    @Override\n');
        }
        this.output.write(`    public ${returnType} ${name}() {\n`);
    }

    protected writeProperty(name: string, override: boolean, type: string, value?: string): void {
        this.output.write(`    private final ${type} ${name};\n`);
    }

    protected writeGetter(name: string, override: boolean, type: string, value?: string): void {
        this.openMethod(toGetter(name), override, type);
        this.output.write(`        return ${value ? `"${value}"` : `this.${name}`};\n`);
        this.closeMethod();
    }

    protected writeCreateMethod(setName: string, iconNamePropertyName: string): void {
        this.output.write(`        return new Icon("${setName}", this.${iconNamePropertyName});\n`);
    }
}

export class KotlinCodeGenerator extends AbstractCodeGenerator {
    protected readonly filenameExtension: string = '.kt';
    protected readonly supportsPropertyInConstructor: boolean = true;
    protected readonly constructorInClassDeclaration: boolean = true;
    protected readonly requireGetters: boolean = false;

    protected writeConstant(constantName: string, iconName: string, last: boolean): void {
        this.output.write(`    ${constantName}("${iconName}")${last ? ';' : ','}\n`);
    }

    protected openFile(packageName: string): void {
        this.output.write(`package ${packageName}\n`);
    }

    protected writeImports(classes: string[]): void {
        for (let className of classes) {
            this.output.write(`import ${className}\n`);
        }
    }

    protected openEnum(name: string, interfaces: string[], iconNameProperty: CodeComponent): void {
        this.output.write(`/**
 * Generated on ${formatDate(new Date())}
 */
enum class ${name}(${iconNameProperty.override ? 'override ' : ''}val ${iconNameProperty.name}: String) `);
        if (interfaces.length) {
            this.output.write(`: ${interfaces.join(', ')} `);
        }
        this.output.write('{\n');
    }

    protected writeConstructor(className: string, iconNameProperty: CodeComponent): void {
    }

    protected openMethod(name: string, override: boolean, returnType: string): void {
        this.output.write(`    ${override ? 'override ' : ''}fun ${name}(): ${returnType} = `);
    }

    protected closeMethod(): void {
    }

    protected writeProperty(name: string, override: boolean, type: string, value: string): void {
        this.output.write(`    ${override ? 'override ' : ''}val ${name}: ${type} = "${value}"\n`);
    }

    protected writeGetter(name: string, override: boolean, type: string, value?: string): void {
    }

    protected writeCreateMethod(setName: string, iconNamePropertyName: string): void {
        this.output.write(`Icon("${setName}", this.${iconNamePropertyName})\n`);
    }
}
