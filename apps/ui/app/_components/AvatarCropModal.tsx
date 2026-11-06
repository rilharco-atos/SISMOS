'use client';
import { useEffect, useRef, useState } from 'react';

const SIZE = 240; // diâmetro do círculo de pré-visualização em px

interface Props {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

/*********************************************************************************************************************
* @component     AvatarCropModal
* @description   Modal de recorte de avatar. O utilizador arrasta a imagem dentro de um círculo e
*                controla o zoom com slider ou scroll. Ao confirmar, captura a área visível para um
*                canvas 128×128 e devolve o Blob via onConfirm.
*********************************************************************************************************************/
export function AvatarCropModal({ file, onConfirm, onCancel }: Props) {
  const [src, setSrc] = useState('');
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const touchRef = useRef<{ x: number; y: number; ox: number; oy: number; dist?: number; os?: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setNatural({ w: 0, h: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // escala base: dimensão mínima da imagem = SIZE
  const baseScale = natural.w ? SIZE / Math.min(natural.w, natural.h) : 1;

  // ——— rato ———
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({ x: dragRef.current.ox + e.clientX - dragRef.current.x, y: dragRef.current.oy + e.clientY - dragRef.current.y });
  };
  const onMouseUp = () => setDragging(false);

  // ——— scroll para zoom ———
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.min(4, Math.max(1, s - e.deltaY * 0.001)));
  };

  // ——— toque ———
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: offset.x, oy: offset.y };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current = { x: 0, y: 0, ox: offset.x, oy: offset.y, dist: Math.hypot(dx, dy), os: scale };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    if (e.touches.length === 1) {
      setOffset({ x: touchRef.current.ox + e.touches[0].clientX - touchRef.current.x, y: touchRef.current.oy + e.touches[0].clientY - touchRef.current.y });
    } else if (e.touches.length === 2 && touchRef.current.dist && touchRef.current.os != null) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      setScale(Math.min(4, Math.max(1, touchRef.current.os * dist / touchRef.current.dist)));
    }
  };
  const onTouchEnd = () => { touchRef.current = null; };

  // ——— captura canvas e devolve Blob ———
  const confirm = () => {
    if (!imgRef.current || !natural.w) return;
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const totalScale = baseScale * scale;
    const displayW = natural.w * totalScale;
    const displayH = natural.h * totalScale;
    const left = SIZE / 2 + offset.x - displayW / 2;
    const top  = SIZE / 2 + offset.y - displayH / 2;
    // mapear o círculo [0,SIZE]×[0,SIZE] para coordenadas naturais da imagem
    ctx.drawImage(imgRef.current, -left / totalScale, -top / totalScale, SIZE / totalScale, SIZE / totalScale, 0, 0, 128, 128);
    canvas.toBlob(b => { if (b) onConfirm(b); }, 'image/jpeg', 0.9);
  };

  const isPortrait = !natural.w || natural.w <= natural.h;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.80)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 20, padding: '28px 32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', border: '1px solid var(--border)', minWidth: 300 }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 15, alignSelf: 'flex-start' }}>Ajustar foto de perfil</div>

        {/* Círculo de pré-visualização */}
        <div
          style={{ width: SIZE, height: SIZE, borderRadius: '50%', overflow: 'hidden', position: 'relative', border: '3px solid #FCAF26', cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none', flexShrink: 0, background: 'var(--bg-tertiary)' }}
          onMouseDown={onMouseDown}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              draggable={false}
              onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={{
                position: 'absolute',
                top: '50%', left: '50%',
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                transformOrigin: 'center',
                width: isPortrait ? '100%' : 'auto',
                height: isPortrait ? 'auto' : '100%',
                minWidth: '100%',
                minHeight: '100%',
                maxWidth: 'none',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>

        {/* Slider de zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="range" min={1} max={4} step={0.01} value={scale} onChange={e => setScale(Number(e.target.value))} style={{ flex: 1, accentColor: '#FCAF26', cursor: 'pointer' }} />
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </div>

        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Arrasta para enquadrar · slider ou scroll para zoom</div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            Cancelar
          </button>
          <button onClick={confirm} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#FCAF26', color: '#071B4C', cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
