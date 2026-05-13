import zipfile
import sys
import xml.dom.minidom

def inspect_xlsx(filepath):
    try:
        with zipfile.ZipFile(filepath, 'r') as z:
            print("Files in xlsx:")
            print(z.namelist())
            
            if 'xl/sharedStrings.xml' in z.namelist():
                print("\n--- xl/sharedStrings.xml ---")
                content = z.read('xl/sharedStrings.xml')
                try:
                    dom = xml.dom.minidom.parseString(content)
                    print(dom.toprettyxml(indent="  "))
                except:
                    print(content.decode('utf-8'))
            else:
                print("No sharedStrings.xml found")
                
            for name in z.namelist():
                if name.startswith('xl/worksheets/sheet'):
                    print(f"\n--- {name} ---")
                    content = z.read(name)
                    if b'{' in content:
                        print(f"Found '{{' in {name}:")
                        print(content.decode('utf-8')[:500])
                        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    inspect_xlsx(sys.argv[1])
