import { Project, SyntaxKind, Node } from 'ts-morph';

const project = new Project();
const sourceFile = project.addSourceFileAtPath('/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/admin/temporal/components/WorkflowEditModal.tsx');

// 1. Rename TemporalPage to WorkflowEditModal
let componentDecl = sourceFile.getVariableDeclaration('TemporalPage');
if (componentDecl) {
    componentDecl.rename('WorkflowEditModal');
} else {
    const funcDecl = sourceFile.getFunction('TemporalPage');
    if (funcDecl) {
        funcDecl.rename('WorkflowEditModal');
    }
}

// 2. Add WorkflowEditModalProps interface
const propsInterface = sourceFile.getInterface('WorkflowEditModalProps');
if (!propsInterface) {
    sourceFile.addInterface({
        name: 'WorkflowEditModalProps',
        isExported: true,
        properties: [
            { name: 'visible', type: 'boolean' },
            { name: 'onCancel', type: '() => void' },
            { name: 'onSave', type: '(data: any) => void' },
            { name: 'initialWorkflow?', type: 'any | null' },
            { name: 'initialDraftDsl?', type: 'any | null' },
        ],
    });
}

// 3. Update component parameters
const componentFunc = sourceFile.getVariableDeclaration('WorkflowEditModal')?.getInitializerIfKind(SyntaxKind.ArrowFunction) || sourceFile.getFunction('WorkflowEditModal');
if (componentFunc) {
    componentFunc.getParameters().forEach(p => p.remove());
    componentFunc.addParameter({
        name: '{ visible, onCancel, onSave, initialWorkflow, initialDraftDsl }',
        type: 'WorkflowEditModalProps',
    });
}

// 4. Remove list-related statements from component body
const body = componentFunc?.getBody();
if (body && Node.isBlock(body)) {
    const statementsToRemove = [
        'workflowsQuery',
        'createMutation',
        'updateMutation',
        'deleteMutation',
        'runMutation',
        'importMutation',
        'searchText',
        'statusFilter',
        'runModalVisible',
        'runParams',
        'selectedWorkflowForRun',
        'executionsQuery',
        'executionDrawerVisible',
        'selectedWorkflowForExecutions',
        'importModalVisible',
        'importTemplateId',
        'workflowOverviewStats',
        'columns',
        'filteredWorkflows',
        'handleImport',
        'handleDelete',
        'handleSearch'
    ];

    body.getStatements().forEach(stmt => {
        if (Node.isVariableStatement(stmt)) {
            const decs = stmt.getDeclarations();
            // If any declaration in the statement matches, remove the statement
            let shouldRemove = false;
            decs.forEach(d => {
                const name = d.getName();
                if (statementsToRemove.includes(name)) {
                    shouldRemove = true;
                }
                // Also check if it's an array destructuring like const [searchText, setSearchText] = useState('')
                if (d.getNameNode().getKind() === SyntaxKind.ArrayBindingPattern) {
                    const elements = d.getNameNode().asKind(SyntaxKind.ArrayBindingPattern)?.getElements();
                    if (elements) {
                        elements.forEach(el => {
                            if (el.getKind() === SyntaxKind.BindingElement) {
                                const elName = el.asKind(SyntaxKind.BindingElement)?.getName();
                                if (elName && statementsToRemove.includes(elName)) {
                                    shouldRemove = true;
                                }
                            }
                        });
                    }
                }
            });
            if (shouldRemove) {
                stmt.remove();
            }
        }
    });
}

// Also rename the export default
const defaultExport = sourceFile.getExportAssignment(e => e.getExpression().getText() === 'TemporalPage');
if (defaultExport) {
    defaultExport.getExpression().replaceWithText('WorkflowEditModal');
}

sourceFile.saveSync();
console.log('Refactoring step 1 completed.');
