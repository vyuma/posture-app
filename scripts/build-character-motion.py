"""Derive non-destructive motion groups from the supplied SVGs. Original portraits stay untouched."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
root_dir = Path(__file__).resolve().parents[1]

def wrap(parent, elements, part):
    index = list(parent).index(elements[0])
    group = ET.Element(f'{{{NS}}}g', {'class': f'rarity-part rarity-part--{part}'})
    for element in elements:
        parent.remove(element)
        group.append(element)
    parent.insert(index, group)

for character in ['sakura-nago', 'miira-nago', 'king-nago']:
    source = root_dir / f'public/characters/anago/{character}/portrait.svg'
    root = ET.fromstring(source.read_text())
    original_geometry = [(e.tag, e.get('d'), e.get('points')) for e in root.iter() if e.tag.endswith(('path','polygon'))]
    matches = lambda cls: [e for e in root.iter() if e.get('class') == cls]
    if character == 'sakura-nago':
        stick = matches('cls-4')[0]
        children = list(root)
        start = children.index(stick)
        wrap(root, children[start:start+4], 'dango')
        for cheek in matches('cls-12'):
            if cheek.tag.endswith('ellipse'): wrap(root, [cheek], 'cheek')
    elif character == 'miira-nago':
        paths = [e for e in root if e.tag.endswith('path')]
        wrap(root, paths[0:2], 'ribbon-low')
        wrap(root, paths[2:4], 'ribbon-head')
        wrap(root, paths[4:6], 'ribbon-bottom')
        head = matches('cls-13')[0]
        for eye in [e for e in head if e.tag.endswith('circle')]: wrap(head,[eye],'eye')
    else:
        body = matches('cls-20')[0]
        cape = matches('cls-16')[0]
        wrap(cape,list(cape),'cape-back')
        wrap(body,[matches('cls-5')[0]],'cape-front')
        wrap(body,[matches('cls-9')[0]],'gem')
        staff = matches('cls-4')[0]
        wrap(staff,[e for e in staff if e.tag.endswith(('circle','ellipse')) and e.get('class') != 'cls-7'],'orb')
    # Resolve Illustrator's global .cls-* rules into presentation attributes.
    # This avoids collisions when several characters exist in the same DOM.
    rules = {}
    for style in list(root.iter(f'{{{NS}}}style')):
        for selectors, declarations in re.findall(r'([^{}]+)\{([^{}]+)\}', style.text or ''):
            attrs = dict(pair.split(':',1) for pair in declarations.rstrip(';').split(';'))
            for selector in selectors.split(','): rules.setdefault(selector.strip().lstrip('.'), {}).update(attrs)
        for parent in root.iter():
            if style in list(parent): parent.remove(style); break
    for element in root.iter():
        cls = element.get('class','')
        if cls in rules:
            for key,value in rules[cls].items(): element.set(key.strip(), value.strip())
            del element.attrib['class']
        if 'id' in element.attrib: element.set('id','__INSTANCE__'+element.get('id'))
        for key,value in list(element.attrib.items()):
            element.set(key,re.sub(r'url\(#([^)]*)\)',r'url(#__INSTANCE__\1)',value))
    root.set('aria-hidden','true'); root.set('focusable','false')
    root.set('class','rarity-rig')
    assert original_geometry == [(e.tag,e.get('d'),e.get('points')) for e in root.iter() if e.tag.endswith(('path','polygon'))]
    target = root_dir / f'src/features/characters/motion/{character}.svg'
    target.write_text(ET.tostring(root,encoding='unicode'))
    print(f'{character}: exact geometry preserved, {target.stat().st_size} bytes')
