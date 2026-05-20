import { Project, SyntaxKind, Node } from 'ts-morph';

const project = new Project();
const sourceFile = project.addSourceFileAtPath('/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/admin/temporal/components/WorkflowEditModal.tsx');

const componentFunc = sourceFile.getVariableDeclaration('WorkflowEditModal')?.getInitializerIfKind(SyntaxKind.ArrowFunction) || sourceFile.getFunction('WorkflowEditModal');
const body = componentFunc?.getBody();

if (body && Node.isBlock(body)) {
    // 1. Remove `editModalVisible` state
    body.getStatements().forEach(stmt => {
        if (Node.isVariableStatement(stmt)) {
            const text = stmt.getText();
            if (text.includes('editModalVisible') && text.includes('useState')) {
                stmt.remove();
            }
        }
    });

    // 2. Add useEffect for initialization
    body.insertStatements(0, `
    useEffect(() => {
        if (visible) {
            if (initialWorkflow) {
                // handleEdit logic
                setEditingWorkflow(initialWorkflow);
                didInitializeCodeSignatureRef.current = false;
                form.setFieldsValue({ name: initialWorkflow.name, description: initialWorkflow.description, taskQueue: initialWorkflow.taskQueue });
                setWorkflowDsl(initialWorkflow.workflowDsl || DEFAULT_WORKFLOW_DSL);
                setActivityDsl(initialWorkflow.activityDsl || DEFAULT_ACTIVITY_DSL);
                setGeneratedCode(initialWorkflow.generatedCode || null);
                setLastGeneratedSignature(null);
                setIsGeneratedCodeStale(false);
                setSelectedStepIndexForConfig((initialWorkflow.workflowDsl?.steps?.length) ? 0 : null);
            } else if (initialDraftDsl) {
                // Draft initialization
                setEditingWorkflow(null);
                didInitializeCodeSignatureRef.current = false;
                form.resetFields();
                setWorkflowDsl(initialDraftDsl.workflowDsl || DEFAULT_WORKFLOW_DSL);
                setActivityDsl(initialDraftDsl.activityDsl || DEFAULT_ACTIVITY_DSL);
                setGeneratedCode(null);
                setLastGeneratedSignature(null);
                setIsGeneratedCodeStale(false);
                setSelectedStepIndexForConfig(initialDraftDsl.workflowDsl?.steps?.length ? 0 : null);
            } else {
                // handleCreate logic
                setEditingWorkflow(null);
                didInitializeCodeSignatureRef.current = false;
                form.resetFields();
                setWorkflowDsl(DEFAULT_WORKFLOW_DSL);
                setActivityDsl(DEFAULT_ACTIVITY_DSL);
                setGeneratedCode(null);
                setLastGeneratedSignature(null);
                setIsGeneratedCodeStale(false);
                setSelectedStepIndexForConfig(null);
            }
        }
    }, [visible, initialWorkflow, initialDraftDsl]);
    `);
}

// 3. Replace text in the entire file:
// editModalVisible -> visible
// setEditModalVisible(false) -> onCancel()
// setEditModalVisible(true) -> /* removed by parent */
let text = sourceFile.getFullText();
text = text.replace(/editModalVisible/g, 'visible');
text = text.replace(/setVisible\(false\)/g, 'onCancel()');
text = text.replace(/setVisible\(true\)/g, '');

// Fix any leftover setEditModalVisible that might not have been caught
text = text.replace(/setEditModalVisible/g, 'onCancel'); // since (false) is usually what's left

// Save
sourceFile.replaceWithText(text);
sourceFile.saveSync();
console.log('Refactoring step 2 completed.');
