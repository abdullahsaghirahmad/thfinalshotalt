export default function InfoPage() {
  return (
    <main className="min-h-screen bg-white p-4 mt-16">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-mono mb-8">About The Final Shot</h1>
        <p className="text-neutral-600 mb-4">
          A minimalist photography portfolio platform that explores the intersection
          of digital and analog photography through the lens of threshold-based image
          processing.
        </p>
        <p className="text-neutral-600 mb-4">
          Each image can be viewed through different threshold values, revealing
          new perspectives and interpretations of the original work.
        </p>
        <div className="mt-12">
          <h2 className="text-lg font-mono mb-4">Contact</h2>
          <p className="text-neutral-600">
            For inquiries, please contact{' '}
            <a
              href="mailto:contact@thefinalshot.com"
              className="underline hover:opacity-60"
            >
              contact@thefinalshot.com
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
