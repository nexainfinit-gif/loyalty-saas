'use client';

interface Props {
  passId:     string;
  token?:     string;
  className?: string;
}

/* Apple logo SVG path — used in the official "Add to Apple Wallet" button style */
function AppleLogo() {
  return (
    <svg
      width="20"
      height="24"
      viewBox="0 0 814 1000"
      fill="white"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-38.8-155.5-127.4C46 405.5 1 339.9 1 247.4 1 111 95.9 14.5 234.4 14.5c74.5 0 135.9 39.9 184 39.9 44.4 0 116.7-47.6 209.3-47.6 37.5 0 153.9 18.9 203.5 111.8zm-187-70.7c-10.2-43.9-58.7-105.6-132.5-105.6-43.1 0-131.3 16.8-179.3 93.8-37.5 59.5-73.5 165.4-73.5 259.1 0 104.7 47.7 201.1 126.5 201.1 77.8 0 122.3-53.7 196.7-53.7 75.4 0 118.5 53.7 196.7 53.7 78.8 0 125.5-96.4 125.5-201.1 0-93.7-35-199.3-72.5-258.8-47.5-77.3-135.7-94.1-187.6-94.1" />
    </svg>
  );
}

/**
 * Official-style "Add to Apple Wallet" button.
 *
 * On iOS Safari, tapping this link triggers the native Wallet install flow.
 * On other platforms it downloads the .pkpass file.
 *
 * Props:
 *  passId    — UUID of the wallet_passes row
 *  className — optional extra classes
 */
export default function AddToAppleWalletButton({ passId, token, className = '' }: Props) {
  const href = token
    ? `/api/wallet/passes/${passId}/pkpass?token=${encodeURIComponent(token)}`
    : `/api/wallet/passes/${passId}/pkpass`;
  return (
    <a
      href={href}
      className={[
        'inline-flex items-center gap-3',
        'bg-black text-white rounded-xl px-5 py-3',
        'hover:bg-gray-900 active:scale-95',
        'transition-all select-none no-underline',
        className,
      ].join(' ')}
      aria-label="Ajouter à Apple Wallet"
    >
      <AppleLogo />
      <div className="leading-tight">
        <div className="text-[9px] font-normal tracking-widest uppercase opacity-80">
          Ajouter à
        </div>
        <div className="text-sm font-bold -mt-px">Apple Wallet</div>
      </div>
    </a>
  );
}
