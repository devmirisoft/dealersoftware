import React from 'react'

function Footer() {
  return (
    <footer className="bg-slate-900 text-white mt-46 px-20">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-8 text-sm">
            <div>
              <h4 className="font-semibold mb-3">Get to Know Us</h4>
              <ul className="space-y-2 text-gray-400 text-xs">
                <li><a href="#" className="hover:text-white transition">About Us</a></li>
                <li><a href="#" className="hover:text-white transition">Careers</a></li>
                <li><a href="#" className="hover:text-white transition">Press</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Connect With Us</h4>
              <ul className="space-y-2 text-gray-400 text-xs">
                <li><a href="#" className="hover:text-white transition">Facebook</a></li>
                <li><a href="#" className="hover:text-white transition">Twitter</a></li>
                <li><a href="#" className="hover:text-white transition">Instagram</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Make Money</h4>
              <ul className="space-y-2 text-gray-400 text-xs">
                <li><a href="#" className="hover:text-white transition">Sell Products</a></li>
                <li><a href="#" className="hover:text-white transition">Advertise</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Help & Settings</h4>
              <ul className="space-y-2 text-gray-400 text-xs">
                <li><a href="#" className="hover:text-white transition">Contact Us</a></li>
                <li><a href="#" className="hover:text-white transition">Privacy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-6 text-center text-xs text-gray-500">
            <p>&copy; {new Date().getFullYear()} All rights reserved.</p>
          </div>
        </div>
      </footer>
  )
}

export default Footer
