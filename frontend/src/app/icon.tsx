import { ImageResponse } from 'next/og';

export const size = {
  width: 256,
  height: 256,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 140,
          background: '#222222',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f4f4f4',
          fontFamily: 'serif',
        }}
      >
        SB
      </div>
    ),
    { ...size }
  );
}
