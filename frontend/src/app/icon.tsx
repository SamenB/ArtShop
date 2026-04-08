import { ImageResponse } from 'next/og'
import fs from 'fs/promises'
import path from 'path'

export const size = { width: 256, height: 256 }
export const contentType = 'image/png'

export default async function Icon() {
  const fontPath = path.join(process.cwd(), 'public/fonts/CormorantGaramond-Regular.ttf')
  const fontData = await fs.readFile(fontPath)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
        }}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"Cormorant Garamond"',
          color: '#111111',
          // Tight kerning so both letters fit perfectly
          letterSpacing: '-10px', 
          fontSize: 261, 
          // Center naturally with optical adjustment for the large caps
          marginTop: -26,
          paddingRight: '6px',
        }}>
          SB
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Cormorant Garamond',
          data: fontData,
          style: 'normal',
          weight: 400,
        },
      ],
    }
  )
}
